# Mantine AI tooling

This repository provides project-scoped Mantine documentation tooling for Codex. Nothing in this
setup changes user-level or system-level Codex configuration.

## What is installed

- `.codex/config.toml` declares the `mantine` stdio MCP server and pins its npm launcher to
  `@mantine/mcp-server@9.7.1`. The launcher also pins `node@22.22.0` and places that isolated
  tooling runtime on the child process's `PATH`; it does not replace the project's Node.js runtime.
  Both npm packages declare the MIT license.
- `.agents/skills/mantine-custom-components/` vendors Mantine's official
  `mantine-custom-components` skill at commit
  [`607846dbc328b6ddc85106d8aad3c080f9f57a1d`](https://github.com/mantinedev/skills/commit/607846dbc328b6ddc85106d8aad3c080f9f57a1d).
  See its `UPSTREAM.md` and `LICENSE` files for provenance and licensing.
- The application currently installs `@mantine/core` and `@mantine/hooks` 9.7.1.

The `mantine-form` and `mantine-combobox` skills are intentionally not installed. This application
uses React Hook Form and Zod as the single owner of form state and validation, and it uses native
select controls rather than custom Mantine Combobox primitives. Do not introduce `@mantine/form`
or a second form-state owner.

## Codex discovery and activation

Codex discovers repository skills from `.agents/skills` between the working directory and the
repository root. Skill changes are normally detected automatically; if the skill or MCP server is
not visible, restart or reload Codex and begin a new turn. The skill can be selected explicitly as
`$mantine-custom-components`, or chosen automatically when its description matches a task.

Codex loads project `.codex/config.toml` only after the user trusts the project. Trust is a local,
user-controlled decision: this repository does not set it and installation must not edit
`~/.codex/config.toml`. After trusting the repository, restart or reload Codex so it can start the
new stdio server, then confirm that the `mantine` tools are present. See the official
[Codex configuration basics](https://learn.chatgpt.com/docs/config-file/config-basic),
[configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference), and
[skill discovery documentation](https://learn.chatgpt.com/docs/build-skills).

## Documentation workflow

For Mantine API or component questions:

1. Use the `mantine` MCP server first. It exposes `list_items`, `get_item_doc`, `get_item_props`,
   `search_docs`, and `get_api`.
2. If MCP is unavailable, use Mantine's official
   [`llms.txt`](https://mantine.dev/llms.txt) index and follow its links to the relevant official
   documentation.
3. Treat the installed package declarations and TypeScript diagnostics as authoritative whenever
   documentation differs from the locally installed 9.7.1 packages.

The npm launcher is pinned, but the server reads Mantine's published static documentation data.
That remote corpus can change independently of the `@mantine/mcp-server@9.7.1` package. Do not
assume that a server pin also pins the documentation snapshot.

Use `get_item_props` for component props and `get_api` for symbol signatures. The 9.7.1 server
is pinned because 9.6.0 could search the current corpus but returned 404 errors for component
documentation and props. Keep the vendored upstream skill unchanged for provenance.

For custom components that use Mantine factories, the Styles API, CSS-variable resolvers, compound
components, or theme registration, also load `$mantine-custom-components` and read the matching
vendored reference. The skill targets Mantine 9.x. Keep its examples subordinate to the installed
9.7.1 declarations if an API has changed.

## Form ownership

React Hook Form owns values, touched/dirty state, submission, and field registration. Zod owns the
schema and validation contract through the existing resolver. Mantine components are presentation
and accessibility primitives only; connect controlled Mantine inputs with React Hook Form's
`Controller` when necessary, and keep native selects registered with React Hook Form. A component
may hold transient input text needed to represent an incomplete numeric edit, but React Hook Form
remains the authoritative field state and validation owner. Do not introduce Mantine Form or any
other authoritative form-state owner.

## Validation performed during setup

The project TOML was parsed locally and checked against the official Codex keys for stdio MCP
servers (`mcp_servers.<id>.command` and `mcp_servers.<id>.args`). A standalone stdio client, without
loading project or global Codex configuration, launched the exact configured command and verified:

- the isolated package set reports Node.js `v22.22.0`;
- MCP initialization completed with protocol version `2024-11-05`;
- `tools/list` returned `list_items`, `get_item_doc`, `get_item_props`, `search_docs`, and `get_api`;
- `search_docs` returned Mantine documentation results for a Button query;
- `get_item_props` and `get_item_doc` successfully retrieved Button metadata and documentation.

This smoke test verifies the exact configured process and its current remote docs access. The
Mantine tools also became visible in the current Codex session, where a search succeeded. Reload
Codex to replace the previously loaded 9.6.0 server with the corrected 9.7.1 configuration.

The outer `npx` command still runs under the developer's current npm/Node installation and may emit
an `EBADENGINE` warning while resolving the package. The actual MCP child runs with the pinned Node
22.22.0 binary. The application's documented Node.js 20.19-or-newer baseline is unchanged.
