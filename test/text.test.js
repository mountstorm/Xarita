import assert from "node:assert/strict";
import { test } from "node:test";
import { escRe, firstSentence, maskName, plain } from "../js/lib/text.js";

test("quiz masking hides the region's name and its longer words", () => {
  const out = maskName("The Timurid Empire ruled from Samarkand; the empire's art spread.", ["Timurid Empire"]);
  assert.equal(out, "The ▁▁▁ ruled from Samarkand; the ▁▁▁'s art spread.");
});

test("masking ignores Russian stress marks (Росси́йская)", () => {
  const out = maskName("Росси́йская импе́рия — государство", ["Российская империя"]);
  assert.equal(out, "▁▁▁ — государство");
  assert.equal(plain("Росси́йская"), "Российская");
});

test("names with regex characters are matched literally", () => {
  assert.equal(maskName("Saxony (1806) was a kingdom.", ["Saxony (1806)"]), "▁▁▁ was a kingdom.");
  assert.equal(escRe("a.b*c"), "a\\.b\\*c");
});

test("empty or missing names are skipped", () => {
  assert.equal(maskName("Nothing to hide here.", [null, undefined, ""]), "Nothing to hide here.");
});

test("first sentence ignores early full stops (abbreviations) and caps the length", () => {
  assert.equal(
    firstSentence("Khiva is a walled oasis city in the Khorezm Region of Uzbekistan. It has walls."),
    "Khiva is a walled oasis city in the Khorezm Region of Uzbekistan.",
  );
  assert.equal(
    firstSentence("St. Petersburg was the capital of the Russian Empire. More text."),
    "St. Petersburg was the capital of the Russian Empire.",
  );
  assert.ok(firstSentence("x".repeat(500)).length <= 240);
});
