import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSpokenIndex } from "./parse-number";

describe("parseSpokenIndex", () => {
  it("maps digits and number words", () => {
    assert.equal(parseSpokenIndex("3"), 3);
    assert.equal(parseSpokenIndex("three"), 3);
    assert.equal(parseSpokenIndex("Five."), 5);
    assert.equal(parseSpokenIndex("first"), 1);
  });

  it("maps phrases like number three or open the second one", () => {
    assert.equal(parseSpokenIndex("number three"), 3);
    assert.equal(parseSpokenIndex("open result 2"), 2);
    assert.equal(parseSpokenIndex("the fourth one"), 4);
    assert.equal(parseSpokenIndex("option five please"), 5);
  });

  it("ignores out-of-range and non-numeric queries", () => {
    assert.equal(parseSpokenIndex("6"), null);
    assert.equal(parseSpokenIndex("zero"), null);
    assert.equal(parseSpokenIndex("search for cats"), null);
    assert.equal(parseSpokenIndex(""), null);
  });

  it("respects max results", () => {
    assert.equal(parseSpokenIndex("5", 3), null);
    assert.equal(parseSpokenIndex("2", 3), 2);
  });
});
