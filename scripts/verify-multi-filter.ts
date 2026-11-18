import assert from "node:assert/strict";
import { matchesMultiFilter, parseMultiFilter, pruneMultiFilter, serializeMultiFilter, singleIncluded } from "../src/lib/multiFilter";

const task = (people: string[]) => (v: string) => people.includes(v);

assert.equal(matchesMultiFilter(undefined, task(["a"])), true);
assert.equal(matchesMultiFilter("a", task(["a"])), true);
assert.equal(matchesMultiFilter("b", task(["a"])), false);
assert.equal(matchesMultiFilter("a,b", task(["b"])), true);
assert.equal(matchesMultiFilter("!elan", task(["a", "elan"])), false);
assert.equal(matchesMultiFilter("!elan", task(["a"])), true);
assert.equal(matchesMultiFilter("!elan", task([])), true);
assert.equal(matchesMultiFilter("a,!elan", task(["a", "elan"])), false);
assert.equal(matchesMultiFilter("a,!elan", task(["a"])), true);

assert.deepEqual(parseMultiFilter("a,!b,a,,!b"), { include: ["a"], exclude: ["b"] });
assert.deepEqual(parseMultiFilter("a,!a"), { include: ["a"], exclude: [] });
assert.equal(serializeMultiFilter({ include: ["a", "b"], exclude: ["c"] }), "a,b,!c");
assert.equal(serializeMultiFilter({ include: [], exclude: [] }), undefined);
assert.equal(singleIncluded("a"), "a");
assert.equal(singleIncluded("a,b"), undefined);
assert.equal(singleIncluded("a,!b"), undefined);
assert.equal(singleIncluded("cat:x"), "cat:x");
assert.equal(pruneMultiFilter("a,zz,!b,!zz", (id) => id !== "zz"), "a,!b");
assert.equal(pruneMultiFilter("zz", (id) => id !== "zz"), undefined);

console.log("multi-filter OK");
