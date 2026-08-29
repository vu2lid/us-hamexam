# Question Pool Cross-Check

This document records the cross-check of our parsed NCVEC question pools against the open-source JSON data from [`russolsen/ham_radio_question_pool`](https://github.com/russolsen/ham_radio_question_pool).

## Method

1. Downloaded the cross-check JSON files for Technician, General, and Extra.
2. Placed them in `data/crosscheck/{technician,general,extra}.json`.
3. Ran `scripts/crosscheck.js` (also at `/tmp/crosscheck.js`) to compare question IDs, question text, answer choices, and correct answers.

## Results

| Pool      | Ours | Cross-check | Missing in ours | Missing in cross-check | Text/choice differences |
|-----------|------|-------------|-----------------|------------------------|-------------------------|
| Technician | 409  | 409         | 0               | 0                      | 0                       |
| General    | 423  | 423         | 0               | 0                      | 1 (G2E02 choice D)      |
| Extra      | 599  | 599         | 0               | 0                      | 0                       |

## Notes

- **General G2E02**: Our PDF source renders choice D as `D.A DX spotting system using a network of software defined radios` (the space between `D.` and `A` is lost in text extraction). The official PDF visually shows the choice text as **"A DX spotting system using a network of software defined radios"**, which is how we parsed it. The cross-check source omits the leading article "A". We keep our version because it matches the official NCVEC PDF.
- All earlier hyphenation/whitespace discrepancies were resolved by improving `scripts/extract-pool.js` to merge lines ending with a hyphen and to validate answer choices more loosely.

## Conclusion

The parsed pools now match the cross-check data within expected extraction/formatting variance. The only remaining difference is the single word-article variation in G2E02, which is faithful to our official PDF source.
