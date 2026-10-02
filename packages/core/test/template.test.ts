import { describe, expect, it } from "vitest";
import { extractVariables, parseTemplate, render, TemplateError } from "../src";

describe("template rendering", () => {
  it("substitutes variables and dotted paths", () => {
    expect(render("Hi {{ name }} from {{user.city}}", { name: "Ada", user: { city: "Pune" } }).text).toBe("Hi Ada from Pune");
  });
  it("reports missing variables", () => {
    const r = render("{{a}} {{b}}", { a: 1 });
    expect(r.text).toBe("1 ");
    expect(r.missing).toEqual(["b"]);
  });
  it("applies filters with arguments", () => {
    expect(render("{{ x | upper }}", { x: "hey" }).text).toBe("HEY");
    expect(render("{{ x | truncate: 3 }}", { x: "abcdef" }).text).toBe("abc…");
    expect(render('{{ x | default: "n/a" }}', {}).text).toBe("n/a");
    expect(render("{{ x | json }}", { x: { a: 1 } }).text).toBe('{"a":1}');
    expect(render('{{ xs | join: " / " }}', { xs: ["a", "b"] }).text).toBe("a / b");
    expect(render("{{ x | trim | lower }}", { x: "  HI " }).text).toBe("hi");
    expect(render("{{ xs | length }}", { xs: [1, 2, 3] }).text).toBe("3");
  });
  it("default filter suppresses missing-variable warnings", () => {
    expect(render('{{ x | default: "y" }}', {}).missing).toEqual([]);
  });
  it("supports if/else/unless blocks", () => {
    const t = "{{#if vip}}VIP{{else}}regular{{/if}}|{{#unless vip}}no{{/unless}}";
    expect(render(t, { vip: true }).text).toBe("VIP|");
    expect(render(t, { vip: false }).text).toBe("regular|no");
    expect(render("{{#if xs}}has{{/if}}", { xs: [] }).text).toBe("");
  });
  it("iterates with each, this and @index", () => {
    expect(render("{{#each xs}}{{@number}}.{{this}} {{/each}}", { xs: ["a", "b"] }).text).toBe("1.a 2.b ");
    expect(render("{{#each docs}}[{{id}}] {{text}}\n{{/each}}", { docs: [{ id: "d1", text: "x" }] }).text).toBe("[d1] x\n");
  });
  it("renders objects as pretty JSON and leaves non-tags alone", () => {
    expect(render("{{o}}", { o: { a: 1 } }).text).toBe('{\n  "a": 1\n}');
    expect(render("{ not a tag }", {}).text).toBe("{ not a tag }");
  });
  it("throws helpful errors for broken templates", () => {
    expect(() => parseTemplate("{{#if a}}x")).toThrow(TemplateError);
    expect(() => parseTemplate("{{/if}}")).toThrow(/Unexpected/);
    expect(() => parseTemplate("{{#each a}}x{{/if}}")).toThrow(/Expected \{\{\/each\}\}/);
    expect(() => render("{{ a | nope }}", { a: 1 })).toThrow(/Unknown filter/);
  });
  it("extracts top-level variables", () => {
    expect(extractVariables("{{a}} {{#if b}}{{c.d}}{{/if}} {{#each items}}{{name}}{{/each}}").sort()).toEqual(["a", "b", "c", "items"]);
  });
  it("supports comments", () => {
    expect(render("a{{! hidden }}b", {}).text).toBe("ab");
  });
});
