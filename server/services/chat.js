import { buildMeta, SOURCE_URLS } from "./metadata.js";

const DEFAULT_BASE_URL = "https://api.minimaxi.com/v1";
const DEFAULT_MODEL = "MiniMax-M3";

export async function runChat({ message, funds = [], history = [], dashboardContext = null }) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      data: {
        status: "configuration_required",
        message:
          "OPENAI_API_KEY is not configured. Set OPENAI_API_KEY in the environment to enable /api/chat."
      },
      meta: buildMeta({
        sources: chatSources(),
        status: "configuration_required",
        caveats: ["Chat was not sent to the model provider because OPENAI_API_KEY is missing."]
      })
    };
  }

  const trimmed = String(message || "").trim();
  if (!trimmed) {
    return {
      data: {
        status: "invalid_request",
        message: "message is required."
      },
      meta: buildMeta({
        sources: chatSources(),
        status: "invalid_request",
        caveats: ["The chat endpoint requires a non-empty message field."]
      })
    };
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const response = await fetch(chatCompletionsUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an AI assistant for a Chinese public-fund collaboration dashboard. Be source-aware, date-aware, and cautious. Do not give personalized financial advice or direct buy/sell orders; explain evidence, overlap, risk, and caveats. Funds whose category field is owned are user-configured holdings; funds whose category field is watchlist are only observation candidates and must not be described as holdings."
        },
        {
          role: "system",
          content: `Current fund snapshot JSON: ${JSON.stringify(funds).slice(0, 24000)}`
        },
        {
          role: "system",
          content: `Current dashboard context JSON: ${JSON.stringify(dashboardContext || {}).slice(0, 20000)}`
        },
        ...normalizeHistory(history),
        {
          role: "user",
          content: trimmed
        }
      ],
      temperature: 0.2,
      max_completion_tokens: 1200,
      thinking: {
        type: "disabled"
      }
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      data: {
        status: "upstream_error",
        message: payload.error?.message || `Model provider request failed with HTTP ${response.status}`
      },
      meta: buildMeta({
        sources: chatSources(),
        status: "upstream_error",
        caveats: ["The model provider returned an error; fund data endpoints were not refreshed by this chat call."]
      })
    };
  }

  return {
    data: {
      status: "ok",
      model,
      message: payload.choices?.[0]?.message?.content || ""
    },
    meta: buildMeta({
      sources: chatSources(),
      status: "ok",
      caveats: ["Chat output is generated from cached/public fund data and should be reviewed before acting."]
    })
  };
}

function chatCompletionsUrl() {
  return `${baseUrl().replace(/\/$/, "")}/chat/completions`;
}

function baseUrl() {
  return process.env.OPENAI_BASE_URL || DEFAULT_BASE_URL;
}

function chatSources() {
  return {
    fundData: SOURCE_URLS,
    chat: chatCompletionsUrl()
  };
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .filter((item) => ["user", "assistant"].includes(item?.role) && item?.content)
    .slice(-10)
    .map((item) => ({
      role: item.role,
      content: String(item.content).slice(0, 4000)
    }));
}
