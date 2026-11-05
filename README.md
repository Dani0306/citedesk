# CiteDesk

A documentation assistant that answers only from a given corpus and cites the exact passage behind every sentence, plus a retrieval eval suite that proves it finds the right passages.

> **Status: in the lab, not deployed.** Architecture, ablation table and demo link arrive with the deploy (see `CLAUDE.md` → Definition of done).

## Develop

```
cp .env.example .env.local   # fill in keys; never commit .env.local
npm install
npm run dev
npm test
```

Project context for contributors and coding agents: [`AGENTS.md`](AGENTS.md), [`CLAUDE.md`](CLAUDE.md).
