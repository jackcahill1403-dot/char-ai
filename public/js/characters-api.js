async function listCharacters() {
  return apiRequest("/api/characters");
}

function getCharacter(id) {
  return apiRequest(`/api/characters/${encodeURIComponent(id)}`);
}

function createCharacter(payload) {
  return apiRequest("/api/characters", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

function deleteCharacter(id) {
  return apiRequest(`/api/characters/${encodeURIComponent(id)}`, { method: "DELETE" });
}

function getRecommendations() {
  return apiRequest("/api/characters/recommendations");
}

function sendCharacterMessage(id, content) {
  return apiRequest(`/api/characters/${encodeURIComponent(id)}/chat`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

function clearCharacterChat(id) {
  return apiRequest(`/api/characters/${encodeURIComponent(id)}/chat`, { method: "DELETE" });
}

function listSessions(characterId) {
  return apiRequest(`/api/characters/${encodeURIComponent(characterId)}/sessions`);
}

function createSession(characterId) {
  return apiRequest(`/api/characters/${encodeURIComponent(characterId)}/sessions`, { method: "POST" });
}

function getSessionMessages(characterId, sessionId) {
  return apiRequest(`/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}`);
}

function renameSession(characterId, sessionId, title) {
  return apiRequest(`/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

function deleteSession(characterId, sessionId) {
  return apiRequest(`/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
}

function sendSessionMessage(characterId, sessionId, content) {
  return apiRequest(
    `/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}/chat`,
    { method: "POST", body: JSON.stringify({ content }) }
  );
}

function regenerateLastReply(characterId, sessionId) {
  return apiRequest(
    `/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}/regenerate`,
    { method: "POST" }
  );
}

function editSessionMessage(characterId, sessionId, messageId, content) {
  return apiRequest(
    `/api/characters/${encodeURIComponent(characterId)}/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
    { method: "PATCH", body: JSON.stringify({ content }) }
  );
}
