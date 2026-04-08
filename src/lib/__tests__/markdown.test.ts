import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("returns empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });

  it("renders headings", () => {
    const result = renderMarkdown("# Hello");
    expect(result).toContain("<h1>Hello</h1>");
  });

  it("renders bold text", () => {
    const result = renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("renders links", () => {
    const result = renderMarkdown("[click](https://example.com)");
    expect(result).toContain('<a href="https://example.com">click</a>');
  });

  it("renders unordered lists", () => {
    const result = renderMarkdown("- item one\n- item two");
    expect(result).toContain("<ul>");
    expect(result).toContain("<li>item one</li>");
    expect(result).toContain("<li>item two</li>");
  });

  it("renders paragraphs", () => {
    const result = renderMarkdown("Hello world");
    expect(result).toContain("<p>Hello world</p>");
  });

  it("strips script tags (XSS prevention)", () => {
    const result = renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("strips event handlers (XSS prevention)", () => {
    const result = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain("onerror");
  });
});
