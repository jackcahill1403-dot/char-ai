const { toCaveman } = require("../../lib/responder");

module.exports = {
  id: "caveman-turbo",
  finalResponse(ctx) {
    if (ctx.mode !== "caveman") return ctx.text;
    const parts = ctx.text.split(/(```[\s\S]*?```)/g);
    return parts
      .map((part) => (part.startsWith("```") ? part : toCaveman(part)))
      .join("");
  },
};
