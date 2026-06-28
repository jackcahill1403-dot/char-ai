// Hugging Face Inference Providers catalog (one HF_TOKEN).
module.exports = [
  {
    id: "hf-kimi",
    label: "Kimi K2.6",
    model: "moonshotai/Kimi-K2.6",
    hint: "Testing / general",
    tier: 1,
  },
  {
    id: "hf-kimi-code",
    label: "Kimi K2.7 Code",
    model: "moonshotai/Kimi-K2.7-Code",
    hint: "Coding",
    tier: 1,
  },
  {
    id: "hf-qwen36",
    label: "Qwen 3.6 35B",
    model: "Qwen/Qwen3.6-35B-A3B",
    hint: "Planning",
    tier: 1,
  },
  {
    id: "glm",
    label: "GLM 5.2",
    model: "zai-org/GLM-5.2",
    hint: "Coding",
    tier: 2,
  },
  {
    id: "hf-gpt-oss",
    label: "GPT-OSS 120B",
    model: "openai/gpt-oss-120b",
    hint: "Testing / deep review",
    tier: 2,
  },
  {
    id: "hf-deepseek-v4",
    label: "DeepSeek V4 Pro",
    model: "deepseek-ai/DeepSeek-V4-Pro",
    hint: "Optional — HF router",
    tier: 2,
  },
  {
    id: "hf-flash",
    label: "DeepSeek V4 Flash",
    model: "deepseek-ai/DeepSeek-V4-Flash",
    hint: "Fast fallback",
    tier: 3,
  },
  {
    id: "hf-custom",
    label: "Custom HF model",
    model: null,
    hint: "Paste any ID from huggingface.co/inference/models",
    tier: 9,
  },
];

const BEST_SINGLE_MODEL = "hf-kimi";

module.exports.BEST_SINGLE_MODEL = BEST_SINGLE_MODEL;
