# localsink

Local-first log sink with a searchable UI and API for developers.

🚧 Early development.

## Motivation

Good logging is essential for a healthy developer experience. In practice, many teams end up building internal tools to collect, inspect, and query logs during local development and testing.

`localsink` exists to explore a more polished, local-first approach to that problem: a simple, self-contained log sink with a searchable UI and API that works well during development without requiring external infrastructure.

### Source Available, Not Open Core

The goal of this project is to provide a full-featured experience to every user. `localsink` is **source-available** software.

The "open core" model is explicitly avoided - there are no artificial feature limitations or proprietary enterprise-only extensions. **The full source code is available.**

The licensing strategy reflects this philosophy:

- **v0** is free to use (including commercially) to encourage adoption and feedback.
- **v1+** will be a commercial product for companies to ensure long-term sustainability, while remaining free for personal, hobby, and open source use.

## License & Roadmap

### Current Version (v0)

Free for both non-commercial **and commercial use** under the **Business Source License 1.1**.

- This version will automatically convert to **GNU Affero General Public License, version 3 (AGPLv3)** on **2028-01-01**.
- **Why?** This removes friction for early adoption while ensuring the v0 codebase eventually becomes available under an **OSI-approved open source license**.

### Future Versions (v1+)

Future versions will be released under the **PolyForm Noncommercial License**.

- Commercial use of v1+ will require a commercial license.
- Personal, hobby, and open source use will remain free.

> **Note:** The v0 code (and any version released before the v1.0 milestone) will remain under the BUSL-1.1 terms, eventually becoming AGPLv3 regardless of the license used for v1+.

> **Forever Free:** `localsink` will always be free for personal, hobby, and open source use.

## Why a Commercial License for v1+?

`localsink` is designed to be a best-in-class developer tool that saves engineering teams time and effort.

- **Avoid Expensive In-House Development** Building and maintaining comparable internal tooling is a significant ongoing engineering cost. A commercial license allows engineering teams to focus on their core products instead.

- **Sustainable Development** Commercial licenses fund continued development, improvements, security updates, and long-term maintenance.

- **Compliance and Peace of Mind** A commercial license provides a clear, standard agreement that aligns with corporate compliance requirements - without the obligations of AGPLv3.
