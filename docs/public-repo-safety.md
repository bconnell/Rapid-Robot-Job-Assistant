# Public Repo Safety

This repository is public. Treat every committed file as public.

## Do Not Commit

- Real resumes
- Real profile data
- Real job application data
- Real imported user data
- API keys
- Bearer tokens
- Cookies
- Browser storage dumps
- Extension storage dumps
- Private logs
- Generated exports
- `rapid-robot-job-assistant-export.json`
- `.crx` packages

## Use Fake Data

Use clearly fake examples such as `alex@example.com`, `Example Robotics`, and `555-010-3344`.

## Git Hygiene

Before committing:

```bash
git status --short
git diff --cached
npm run build
npm test
npm run typecheck
npm run lint
```

Check that private file patterns are covered by `.gitignore`.

If you use local export while testing, keep the exported JSON outside the repo or delete it before checking `git status`.
