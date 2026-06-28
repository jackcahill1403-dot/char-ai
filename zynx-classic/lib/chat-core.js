const { readMemory, writeMemory, FORCED_MODE } = require("./memory");
const { buildReply } = require("./responder");
const { callModel } = require("./llm");
const { statusForModels, checkCavemanLimit, recordModels } = require("./rate-limiter");
const { runAgentPipeline } = require("./agents");
const { parseAgentsCommand, parseScriptCommand, parseMetaCommand, DEV_TEAM_ON_REPLY } = require("./commands");
const { listAvailableCommands, formatCommandList } = require("./command-registry");
const { factsContextBlock, learnFromUserMessage, addFact, readFacts } = require("./long-term-memory");
const { scriptRagBlock } = require("./script-rag");
const { projectIndexBlock } = require("./project-index");
const { maybeUpdateSessionSummary, getSessionSummary } = require("./session-summary");
const { searchWeb, formatSearchResults, webSearchBlock, looksLikeWebQuery } = require("./web-search");
const { buildChatMessages } = require("./chat-context");
const { routeModel } = require("./model-router");
const { looksIncompleteCode } = require("./ai-quality");
const { readProjectFile } = require("./file-read");
const { openrouterConfigured } = require("./openrouter-keys");
const {
  applyUserMessage,
  applyFinalResponse,
  isPluginEnabled,
} = require("./plugins");
const {
  findScript,
  saveLocalScript,
  publishScript,
  formatScriptList,
  lastAssistantContent,
  slugify,
} = require("./scripts");
const { getCached, setCached } = require("./response-cache");
const { friendlyLlmError } = require("./errors");
const { activeMessages, setActiveMessages } = require("./conversations");

async function buildExtraContext(userId, mem, task, attachment) {
  let extra = factsContextBlock(userId);
  extra += scriptRagBlock(task, mem.savedScripts || []);
  extra += projectIndexBlock(task);
  if (attachment?.content) {
    extra += `\n\n--- Attached file: ${attachment.name || "file"} ---\n\`\`\`\n${String(attachment.content).slice(0, 12000)}\n\`\`\`\n--- end attach ---`;
  }
  if (looksLikeWebQuery(task)) {
    try {
      extra += await webSearchBlock(task);
    } catch {
      /* search optional */
    }
  }
  return extra;
}

function pickChatModel(mem, task, userId) {
  if (mem.settings.autoRoute === false) return mem.settings.model || "or-kimi";
  return routeModel(task, { openrouter: openrouterConfigured(), userId }).modelId;
}

async function callModelWithQuality(modelId, messages, mode, displayName, opts) {
  let result = await callModel(modelId, messages, mode, displayName, opts);
  if (!result?.ok) return result;

  if (looksIncompleteCode(result.content)) {
    const cont = await callModel(
      modelId,
      [
        ...messages,
        { role: "assistant", content: result.content },
        {
          role: "user",
          content: "Continue exactly where you left off. Do not repeat anything already written. Close any open code fences.",
        },
      ],
      mode,
      displayName,
      { ...opts, taskType: "continue", onStream: opts.onStream }
    );
    if (cont.ok) {
      result = {
        ...result,
        content: `${result.content}\n${cont.content}`,
        streamed: result.streamed || cont.streamed,
      };
    }
  }

  return result;
}

function resolveUsageModelIds(mem, runPipeline, task, userId) {
  if (runPipeline && mem.agents?.length) {
    return [...new Set(mem.agents.map((a) => a.model).filter(Boolean))];
  }
  return [pickChatModel(mem, task || "", userId)];
}

function usageSnapshot(userId, mem, runPipeline, task) {
  const modelIds = resolveUsageModelIds(mem, runPipeline, task, userId);
  return statusForModels(userId, modelIds, { devTeam: Boolean(runPipeline && modelIds.length > 1) });
}

function buildPluginCtx(mem, history, mode, displayName) {
  return { mode, displayName, chatHistory: history };
}

function autoScriptName(task) {
  const base = slugify(task.slice(0, 40)) || "output";
  return `auto-${base}-${Date.now().toString(36)}`;
}

function pushCommandExchange(userId, mem, userContent, assistantContent, meta = {}) {
  const now = new Date().toISOString();
  const msgs = activeMessages(mem);
  msgs.push({ role: "user", content: userContent, timestamp: now });
  msgs.push({
    role: "assistant",
    content: assistantContent,
    timestamp: new Date().toISOString(),
    llm: { used: false, free: true, ...meta },
  });
  setActiveMessages(mem, msgs);
  writeMemory(userId, mem);
  return msgs;
}

function makeStreamEmitter(stream) {
  if (!stream) return () => {};
  return (event) => {
    if (typeof event === "string") stream({ type: "delta", delta: event });
    else stream(event);
  };
}

function streamText(text, emit, chunkSize = 24) {
  if (!emit) return;
  for (let i = 0; i < text.length; i += chunkSize) {
    emit({ type: "delta", delta: text.slice(i, i + chunkSize) });
  }
}

async function postDiscordOutbound(content, llm) {
  const url = process.env.DISCORD_OUTBOUND_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**${require("./branding").APP_NAME} reply** (${llm?.provider || "mock"})\n${String(content).slice(0, 1800)}`,
      }),
    });
  } catch {
    /* ignore */
  }
}

async function processChat({
  content,
  stream,
  userId = "default",
  regenerate = false,
  editIndex = null,
  attachment = null,
}) {
  const emit = makeStreamEmitter(stream);
  const mem = readMemory(userId);
  let skipUserPush = false;

  if (regenerate) {
    let msgs = activeMessages(mem);
    if (msgs.length && msgs[msgs.length - 1].role === "assistant") msgs.pop();
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    if (!lastUser) return { error: "Nothing to regenerate.", status: 400 };
    setActiveMessages(mem, msgs);
    writeMemory(userId, mem);
    content = lastUser.content;
    skipUserPush = true;
  }

  if (editIndex !== null && editIndex !== undefined) {
    const idx = Number(editIndex);
    let msgs = activeMessages(mem);
    if (!msgs[idx] || msgs[idx].role !== "user") {
      return { error: "Invalid message to edit.", status: 400 };
    }
    const newText = String(content || "").trim();
    if (!newText) return { error: "Message cannot be empty.", status: 400 };
    msgs[idx] = { ...msgs[idx], content: newText, timestamp: new Date().toISOString() };
    setActiveMessages(mem, msgs.slice(0, idx + 1));
    writeMemory(userId, mem);
    content = newText;
    skipUserPush = true;
  }

  const trimmed = String(content || "").trim();
  if (!trimmed) {
    return { error: "Message cannot be empty.", status: 400 };
  }

  const { displayName, model } = mem.settings;
  const mode = FORCED_MODE;
  const scriptCmd = parseScriptCommand(trimmed);
  const agentsCmd = parseAgentsCommand(trimmed);
  const metaCmd = parseMetaCommand(trimmed);

  if (metaCmd) {
    let reply = "";
    if (metaCmd.action === "help") {
      reply = formatCommandList(listAvailableCommands(mem.plugins));
    } else if (metaCmd.action === "remember") {
      if (!metaCmd.arg) return { error: "Usage: !remember <fact>", status: 400 };
      addFact(userId, metaCmd.arg);
      reply = `Remembered: ${metaCmd.arg}`;
    } else if (metaCmd.action === "facts") {
      const facts = readFacts(userId);
      reply = facts.length
        ? `**Memory**\n${facts.map((f) => `- ${f.value}`).join("\n")}`
        : "No facts saved. Use `!remember something`.";
    } else if (metaCmd.action === "route") {
      const r = routeModel(metaCmd.arg, { openrouter: openrouterConfigured(), userId });
      reply = `Auto-route → **${r.modelId}** (${r.reason})`;
    } else if (metaCmd.action === "search") {
      if (!metaCmd.arg) return { error: "Usage: !search <query>", status: 400 };
      try {
        const results = await searchWeb(metaCmd.arg);
        reply = formatSearchResults(metaCmd.arg, results);
      } catch (err) {
        return { error: err.message, status: 400 };
      }
    } else if (metaCmd.action === "summary") {
      const brief = getSessionSummary(mem);
      reply = brief
        ? `**Session brief**\n\n${brief}`
        : "No session brief yet — starts after ~20 messages in this chat.";
    } else if (metaCmd.action === "read") {
      if (!metaCmd.arg) return { error: "Usage: !read path/to/file", status: 400 };
      try {
        const file = readProjectFile(metaCmd.arg);
        reply = `**File: ${file.path}**${file.truncated ? " (truncated)" : ""}\n\n\`\`\`\n${file.content}\n\`\`\``;
      } catch (err) {
        return { error: err.message, status: 400 };
      }
    }
    streamText(reply, emit);
    const messages = pushCommandExchange(userId, mem, trimmed, reply, {
      command: `!${metaCmd.action}`,
      free: true,
    });
    return {
      messages,
      llm: { used: false, free: true, command: `!${metaCmd.action}`, badge: "cmd" },
      rateLimit: usageSnapshot(userId, mem, false, trimmed),
    };
  }

  if (scriptCmd) {
    const { action, arg } = scriptCmd;
    let reply = "";

    if (action === "scripts") {
      reply = formatScriptList(mem.savedScripts);
    } else if (action === "save") {
      if (!arg) return { error: "Usage: !save my-script-name", status: 400 };
      try {
        const body = lastAssistantContent(activeMessages(mem));
        mem.savedScripts = saveLocalScript(mem.savedScripts, arg, body);
        writeMemory(userId, mem);
        reply = `Saved script \`${arg}\`. Run FREE: !run ${slugify(arg)}. Publish: !publish ${slugify(arg)}`;
      } catch (err) {
        return { error: err.message, status: 400 };
      }
    } else if (action === "publish") {
      if (!arg) return { error: "Usage: !publish my-script-name", status: 400 };
      try {
        mem.savedScripts = publishScript(mem.savedScripts, arg, displayName || "user");
        writeMemory(userId, mem);
        reply = `Published \`${arg}\` globally. Everyone can !run it for free.`;
      } catch (err) {
        return { error: err.message, status: 400 };
      }
    } else if (action === "run") {
      if (!arg) return { error: "Usage: !run script-name", status: 400 };
      const script = findScript(arg, mem.savedScripts);
      if (!script) return { error: `Script not found: ${arg}. Try !scripts`, status: 404 };
      reply = `[Script: ${script.name} (${script.source}) — FREE replay]\n\n${script.content}`;
    }

    streamText(reply, emit);
    const messages = pushCommandExchange(userId, mem, trimmed, reply, { command: `!${action}`, free: true });
    return {
      messages,
      llm: { used: false, free: true, command: `!${action}`, badge: "script" },
      rateLimit: usageSnapshot(userId, mem, false, trimmed),
    };
  }

  if (agentsCmd) {
    mem.agentsEnabled = true;
    if (!agentsCmd.task) {
      const now = new Date().toISOString();
      const msgs = activeMessages(mem);
      msgs.push({ role: "user", content: trimmed, timestamp: now });
      msgs.push({
        role: "assistant",
        content: DEV_TEAM_ON_REPLY,
        timestamp: new Date().toISOString(),
        llm: { used: false, command: "!agents", devTeam: true, badge: "dev-team" },
      });
      setActiveMessages(mem, msgs);
      writeMemory(userId, mem);
      streamText(DEV_TEAM_ON_REPLY, emit);
      return {
        messages: msgs,
        llm: { used: false, command: "!agents", devTeam: true, badge: "dev-team" },
        rateLimit: usageSnapshot(userId, mem, false, trimmed),
        agentsEnabled: true,
        activeConversationId: mem.activeConversationId,
      };
    }
  }

  let pipelineTask = agentsCmd?.task || trimmed;
  if (agentsCmd?.continueFrom) {
    const script = findScript(agentsCmd.continueFrom, mem.savedScripts);
    if (!script) {
      return {
        error: `Continue script not found: ${agentsCmd.continueFrom}. Try !scripts`,
        status: 404,
      };
    }
    pipelineTask = `Continue from saved script "${script.name}" (${script.slug}):\n\n${script.content}\n\n---\nNew task: ${agentsCmd.task}`;
  }

  const runPipeline = (agentsCmd && agentsCmd.task) || (mem.agentsEnabled && mem.agents.length);

  if (mem.settings.useResponseCache !== false) {
    const cached = getCached(pipelineTask);
    if (cached) {
      const reply = `[Cached replay — FREE, no limit used]\n\n${cached}`;
      streamText(reply, emit);
      const messages = pushCommandExchange(
        userId,
        mem,
        trimmed,
        reply,
        { cached: true, free: true, badge: "cached" }
      );
      return {
        messages,
        llm: { used: false, free: true, cached: true, badge: "cached" },
        rateLimit: usageSnapshot(userId, mem, runPipeline, pipelineTask),
        agentsEnabled: mem.agentsEnabled,
      };
    }
  }

  const usageModels = resolveUsageModelIds(mem, runPipeline, pipelineTask, userId);
  const limit = checkCavemanLimit(userId, usageModels, {
    devTeam: Boolean(runPipeline && usageModels.length > 1),
  });
  if (!limit.ok) {
    return {
      error: limit.error,
      status: 429,
      rateLimit: limit.rateLimit,
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const now = new Date().toISOString();
  const msgs = activeMessages(mem);
  if (!skipUserPush) {
    msgs.push({ role: "user", content: trimmed, timestamp: now });
    setActiveMessages(mem, msgs);
    learnFromUserMessage(userId, trimmed);
  }

  const sessionSummary = getSessionSummary(mem);
  const history = buildChatMessages(msgs.slice(0, -1), { sessionSummary });
  const pluginCtx = buildPluginCtx(mem, history, mode, displayName);
  const extraContext = await buildExtraContext(userId, mem, pipelineTask, attachment);

  let replyText;
  let llm = { used: false, provider: model, countsAsOneMessage: true, badge: "mock" };

  if (runPipeline && mem.agents.length) {
    const pipelineResult = await runAgentPipeline({
      userMessage: pipelineTask,
      agents: mem.agents,
      mode,
      displayName,
      plugins: mem.plugins,
      chatHistory: history,
      extraContext,
      pipelineEvents: emit,
    });
    replyText = pipelineResult.content;
    const usedModels = pipelineResult.steps.filter((s) => s.ok).map((s) => s.model);
    if (usedModels.length) recordModels(userId, usedModels);
    llm = {
      used: pipelineResult.steps.some((s) => s.ok),
      pipeline: true,
      devTeam: true,
      command: agentsCmd ? "!agents" : undefined,
      countsAsOneMessage: true,
      oneMessage: true,
      badge: "dev-team · 1 msg",
      steps: pipelineResult.steps.map((s) => ({
        name: s.name,
        model: s.model,
        ok: s.ok,
        failed: s.failed,
        error: s.error,
      })),
      provider: pipelineResult.provider,
      model: pipelineResult.model,
    };
  } else {
    const chatModel = pickChatModel(mem, pipelineTask, userId);
    const routeInfo = routeModel(pipelineTask, { openrouter: openrouterConfigured(), userId });
    const boosted = applyUserMessage(pipelineTask, pluginCtx, mem.plugins);
    const chatMessages = buildChatMessages(msgs.slice(0, -1), { sessionSummary, userMessage: boosted });
    const llmOpts = {
      extraContext,
      taskType: routeInfo.reason === "coding" ? "coding" : "general",
      onStream: stream
        ? (delta) => emit({ type: "delta", delta })
        : undefined,
      onFallback: (fb) => emit({ type: "fallback", ...fb }),
    };
    const llmResult = await callModelWithQuality(
      chatModel,
      chatMessages.filter((m) => m.role !== "system").length
        ? chatMessages
        : [{ role: "user", content: boosted }],
      mode,
      displayName,
      llmOpts
    );
    if (llmResult.ok) {
      recordModels(userId, [chatModel]);
      replyText = applyFinalResponse(llmResult.content, pluginCtx, mem.plugins);
      llm = {
        used: true,
        provider: llmResult.provider,
        model: llmResult.model,
        routedModel: chatModel,
        routeReason: routeInfo.reason,
        countsAsOneMessage: true,
        badge: llmResult.fallback
          ? `${llmResult.provider} (fallback)`
          : `${chatModel}${mem.settings.autoRoute === false ? "" : ` · ${routeInfo.reason}`}`,
        fallback: llmResult.fallback,
        fallbackFrom: llmResult.fallbackFrom,
        fallbackTo: llmResult.fallbackTo,
        requestedProvider: llmResult.requestedProvider,
        streamed: llmResult.streamed,
      };
    } else {
      replyText = applyFinalResponse(buildReply(trimmed, mode), pluginCtx, mem.plugins);
      llm = {
        used: false,
        provider: model,
        badge: "mock",
        error: friendlyLlmError(llmResult.reason, llmResult.detail, llmResult.provider),
        reason: llmResult.reason,
        detail: llmResult.detail,
      };
    }
  }

  let autoSavedAs = null;
  const rawReply = replyText;
  if (isPluginEnabled(mem.plugins, "script-vault") && rawReply.trim() && (llm.used || llm.pipeline)) {
    try {
      const saveName = autoScriptName(pipelineTask);
      mem.savedScripts = saveLocalScript(mem.savedScripts, saveName, rawReply);
      autoSavedAs = slugify(saveName);
      llm.autoSavedAs = autoSavedAs;
    } catch {
      /* ignore */
    }
  }

  if (isPluginEnabled(mem.plugins, "script-vault")) {
    replyText = applyFinalResponse(
      rawReply,
      { mode, displayName, devTeam: Boolean(llm.pipeline), autoSavedAs },
      mem.plugins
    );
  }

  if (!llm.streamed) streamText(replyText, emit);

  const finalMsgs = activeMessages(mem);
  finalMsgs.push({
    role: "assistant",
    content: replyText,
    timestamp: new Date().toISOString(),
    llm,
  });
  setActiveMessages(mem, finalMsgs);

  if (mem.settings.useResponseCache !== false && llm.used) {
    setCached(pipelineTask, rawReply);
  }

  if (llm.used || llm.pipeline) {
    await maybeUpdateSessionSummary(mem, displayName);
  }

  writeMemory(userId, mem);
  await postDiscordOutbound(replyText, llm);

  return {
    messages: finalMsgs,
    llm,
    rateLimit: usageSnapshot(userId, mem, runPipeline, pipelineTask),
    agentsEnabled: mem.agentsEnabled,
    activeConversationId: mem.activeConversationId,
  };
}

module.exports = { processChat, pushCommandExchange, streamText };
