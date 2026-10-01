# Description-based location extraction, version 1

`pnpm match:locations` now reads saved descriptions and extracts a deliberately
limited set of explicit English statements. No external AI service or paid API is
used. This is an initial rules-based extractor, not general language understanding.

Supported patterns include explicit remote/hybrid/onsite arrangements, mandatory
five-day office attendance, one-to-four-day office requirements, the explicit 25%
hybrid policy, remote permission from named countries or worldwide, and an explicit
office city paired with a supported country name. Additional languages, complex
country lists, alternative arrangements and implicit statements need review.

Every extracted fact records a supporting sentence after HTML/entity normalization.
Reports include extraction version, evidence, issues and decision source. An office
address alone does not establish required attendance. A country that is allowed
does not exclude other countries unless the text says “only”. Commute times are
never estimated from job descriptions or city names. Work authorization is separate.

Conflicting recognized modes/countries and detected additional restrictions defer
the decision. Pattern matching cannot recognize every possible qualification; an
automated location result is provisional and should be checked before applying.
Current manual reviews take priority. Outdated manual reviews still require review.

Descriptions are read from the database without changes. Only evidence sentences,
not full descriptions or the candidate profile, are included in the private report.
The original location string and mode remain visible as source metadata; the
structured extracted conditions live under `extraction.location` in the JSON report.
