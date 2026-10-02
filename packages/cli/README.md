# prompt-colosseum (CLI)

`colosseum` runs Prompt Colosseum eval suites from the terminal or CI. It supports OpenAI, Gemini, any OpenAI-compatible API, or a deterministic mock, and writes JUnit, Markdown and JSON output. Exit code 1 on regressions.

```bash
colosseum init suite.yaml
colosseum run suite.yaml --mock
GEMINI_API_KEY=... colosseum run suite.yaml --baseline main.json --junit junit.xml
```

Docs and the browser arena: https://github.com/gfxroy/prompt-colosseum · https://gfxroy.github.io/prompt-colosseum/
