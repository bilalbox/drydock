import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, injectBoot, stripMutations, stripPrefix, upstreamRequestPath } from "../src/server.js";

test("read queries are allowed and writes are refused", () => {
  assert.equal(decide("GET", "/api/clouds/aws/services/storage/resources"), "allow");
  assert.equal(decide("POST", "/api/clouds/aws/services/logs/query"), "allow");
  assert.equal(decide("POST", "/api/clouds/aws/services/nosql/resources/db/containers/c/query"), "allow");
  assert.equal(decide("POST", "/api/clouds/aws/services/storage/resources/id/key-query"), "allow");
  assert.equal(decide("POST", "/api/clouds/aws/services/storage/resources"), "deny");
  assert.equal(decide("DELETE", "/api/clouds/aws/services/storage/resources/bucket"), "deny");
  assert.equal(decide("PUT", "/api/clouds/aws/services/storage/resources/bucket/object"), "deny");
  assert.equal(decide("POST", "/api/clouds/aws/services/storage/resources/bucket/empty"), "deny");
});

test("inspector prefix is removed before the upstream path is chosen", () => {
  assert.equal(stripPrefix("/inspector/cloud-explorer/aws/storage"), "/cloud-explorer/aws/storage");
  assert.equal(stripPrefix("/cloud-explorer/aws/storage"), "/cloud-explorer/aws/storage");
  assert.equal(decide("POST", stripPrefix("/inspector/api/clouds/aws/services/storage/resources")), "deny");
});

test("schema mutations are removed and list remains", () => {
  const stripped = stripMutations({
    actions: ["list", "create", "delete", "inspect"],
    capabilities: {
      resourceActions: [
        { name: "list", enabled: true },
        { name: "create", enabled: true },
        { name: "emptyBucket", enabled: true },
      ],
      objectActions: [
        { name: "download", enabled: true },
        { name: "upload", enabled: true },
        { name: "delete", enabled: true },
      ],
    },
  });
  assert.deepEqual(stripped.actions, ["list", "inspect"]);
  assert.deepEqual(stripped.capabilities.resourceActions.map((item) => item.name), ["list"]);
  assert.deepEqual(stripped.capabilities.objectActions.map((item) => item.name), ["download"]);
});

test("document navigations load the console shell so client routes survive the prefix", () => {
  const accept = "text/html,application/xhtml+xml";
  assert.equal(upstreamRequestPath("/cloud-explorer/aws/storage", accept), "/");
  assert.equal(upstreamRequestPath("/assets/index-abc.js", accept), "/assets/index-abc.js");
  assert.equal(
    upstreamRequestPath("/api/clouds/aws/services/storage/schema", "application/json"),
    "/api/clouds/aws/services/storage/schema",
  );
  assert.equal(
    upstreamRequestPath("/api/clouds/aws/services/logs/query", "text/html, application/json", "POST"),
    "/api/clouds/aws/services/logs/query",
  );
});

test("html responses gain the boot script", () => {
  const html = injectBoot("<html><head><title>x</title></head><body></body></html>");
  assert.match(html, /<head><script src="\/inspector-boot.js"><\/script>/);
});
