import assert from "node:assert/strict";
import { unsafeSvgReason } from "../src/lib/uploadFile";

// SVG de decoración permitidos vs. variantes de inyección que deben rechazarse.
const svg = (body: string, attrs = "") => Buffer.from(`<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"${attrs}>${body}</svg>`);

const ok = [
  svg('<path d="M0 0h10v10z" fill="#c00"/>'),
  svg('<defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g)" width="5" height="5"/><use href="#g"/><use xlink:href="#g"/>'),
  svg('<style>.a{fill:blue}</style><image href="data:image/png;base64,AAAA"/>'),
];
for (const b of ok) assert.equal(unsafeSvgReason(b), null, b.toString());

const bad = [
  svg("<script>alert(1)</script>"),
  svg("< SCRIPT >alert(1)</script>"),
  svg('<rect onload="alert(1)"/>'),
  svg("", ' onload="alert(1)"'),
  svg('<a href="javascript:alert(1)"><rect/></a>'),
  svg('<a xlink:href="&#106;avascript:alert(1)"><rect/></a>'),
  svg('<image href="https://evil.example/x.png"/>'),
  svg('<image href="data:text/html,<script>x</script>"/>'),
  svg('<foreignObject><iframe src="x"/></foreignObject>'),
  svg('<a><set attributeName="href" to="&#106;avascript:alert(1)"/></a>'),
  Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>'),
  Buffer.from("<svg><script>alert(1)</script></svg>", "utf16le"),
  Buffer.from("<html><script>alert(1)</script></html>"),
];
for (const b of bad) assert.notEqual(unsafeSvgReason(b), null, b.toString());

console.log("verify-svg-upload: OK");
