# lib/client — dsh-tools 客户端源码片段

`lib/client.js` 是 DSH 要求的单文件客户端 bundle，由本目录下的源码片段构建生成。

- 这些文件**不是独立模块**，而是会被 `scripts/build-client.mjs` 按顺序拼进同一个 `window.__ModuleLoader__.load({ id: "dsh-tools", factory })` 闭包内的 JS 片段。
- 修改本目录后，运行：

  ```sh
  npm run build:client
  ```

- `npm pack` / `npm publish` 前会自动执行 `prepack`，因此发布物中的 `lib/client.js` 始终是最新构建结果。
- 请勿直接手工修改 `lib/client.js`，应修改本目录下的片段后重新构建。
