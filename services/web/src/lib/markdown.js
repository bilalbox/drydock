import { marked } from "marked";
import DOMPurify from "dompurify";

marked.use({ gfm: true, breaks: true });

export function renderMarkdown(source) {
  const html = marked.parse(source ?? "", { async: false });
  return DOMPurify.sanitize(String(html));
}
