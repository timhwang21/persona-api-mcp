# Notes written by a human

- The one-shot approach generated a lot of stuff. I have no idea if it works.
- PROMPT.md contains the initial prompt.
- I then asked it to symlink instead of duplicating everything via Zod: "the zod schema is nice but I don't like how it is implemented with Zod. Can you symlink ../persona-web/openapi/external and parse the YAML instead? Or use a tool for parsing openapi?" If stuff is broken it may be because of this big refactor.
- It had lots of code errors / type errors in the first pass.
- Without a good AGENTS.md file there was a LOT of "2 steps forward, 1 step back". Not having a good "memory" or overarching goal meant that Claude went in circles a LOT when implementing things.
- Claude is VERY bad at integration testing. It couldn't run the MCP server itself and diagnose what was wrong. Without this feedback loop, a lot of its implementations were contradictory, e.g. it would implement validations that blocked valid input, have tool descriptions that were incorrect, etc.
- Claude's tendency to accomplish tasks by any means necessary was quite bad. For example when I asked it to refer to the OpenAPI spec to implement something, it'd try to parse the YAML, fail, and then "guess" as to what to build without actually reading the YAML. It's helpful to tell Claude to have explicit stop instructions, e.g. "if you can't parse the YAML, stop and await further instruction."
- Sometimes Claude actually builds something in a good way, but I misunderstand the intent, think it's a bug, and as it to fix it. Claude always acquieses and says I am "totally correct," and then goes off and does the wrong thing. I think there is likely value in telling Claude to stand its ground more.
