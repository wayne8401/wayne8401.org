# Plugins

A plugin is one `.mjs` file that gives every agent a new tool. Put it in this folder
(or in `DATA_DIR/plugins/`) and restart the server. It shows up in the app under
**Brain → Connect → Plugins**, where you can switch it on or off.

```js
// plugins/hello.mjs
export default {
  name: 'hello',                 // tool name the model sees (becomes plugin_hello)
  label: 'Hello',                // shown in the app
  icon: '👋',
  description: 'Greets someone by name.',   // tell the model when to use it
  parameters: {                  // JSON Schema for the input
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
  },
  async run({ name }, ctx) {     // ctx = { agent, task }
    return `Hello, ${name}!`;    // return text (keep it short and useful)
  },
};
```

Tips: validate inputs, catch network errors and return a readable message, and never
put API keys in the file. Read them from `process.env` instead.
