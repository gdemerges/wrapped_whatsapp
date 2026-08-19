# Fonts

`space-grotesk-*.woff2` — Space Grotesk, by Florian Karsten.
Licensed under the SIL Open Font License 1.1 (https://openfontlicense.org),
which permits redistribution and self-hosting.

Self-hosted on purpose: loading it from Google Fonts would mean a third-party
request on a site whose whole promise is that nothing leaves the device, and
would force `font-src`/`style-src` in the CSP to be opened up.

Two subsets are shipped (latin, latin-ext) — 41 KB together, covering French,
Spanish, German and English participant names.
