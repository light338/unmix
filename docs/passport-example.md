# Preservation passport example

Authored file/command fixture. Repairs and manual records are synthetic; no live model, UI or independent user test.

## missingManual

Ready: false; automated commands passed: true.

| Requirement | Original | Candidate | Result |
| --- | --- | --- | --- |
| payment | passed | passed | passed |
| guest | failed | passed | passed |
| receipt | passed | passed | passed |
| scroll | not_checked | not_checked | not_checked |

## broken

Ready: false; automated commands passed: false.

| Requirement | Original | Candidate | Result |
| --- | --- | --- | --- |
| payment | passed | failed | failed |
| guest | failed | passed | passed |
| receipt | passed | passed | passed |
| scroll | passed | stale | stale |

## repaired

Ready: true; automated commands passed: true.

| Requirement | Original | Candidate | Result |
| --- | --- | --- | --- |
| payment | passed | passed | passed |
| guest | failed | passed | passed |
| receipt | passed | passed | passed |
| scroll | passed | passed | passed |

Restoring the exact previous file tree makes its earlier observations applicable again. A different repaired tree would require new observations. Freshness does not cover browser/database/runtime state.
