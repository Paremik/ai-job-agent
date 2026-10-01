# Structured requirement extraction

Run `pnpm requirements:extract` to read saved job descriptions and write private
Markdown and JSON reports. No database rows are modified, no external AI provider
is called, and no applications are sent. Reports include job ID, source URL and
content hash, so later scoring can reject stale analysis.

Version 1 is a partial rules-based baseline, not the planned general LLM extractor.
It recognizes English/Polish section headings and selected explicit requirement
phrases, common technology names, numeric years of experience, languages with
explicit CEFR levels, and categories such as education, travel and authorization.
It preserves unsupported statements within recognized requirement sections.

Each statement has importance (required/preferred/unspecified/not_required), its
section, supporting text and offsets in HTML-normalized description text. Offsets
are not offsets into the raw HTML. Alternatives remain grouped; do not require
every skill in an “A or B” statement. Experience quantities retain their context and
must never be added together. “Fluent” does not imply a particular CEFR level.

Coverage is always partial or none. Missing extracted facts do not establish the
absence of a requirement. Ambiguous headings, unsupported languages, nested lists,
negations and complex clauses need human or later model-based review. Reports are
not suitability scores and must not be used alone for automatic rejection.

The next stage can implement an LLM provider behind the same structured output and
validate every evidence span before deterministic candidate comparison. The current
stage requires no API key and does not send CV or vacancy content to a model.
