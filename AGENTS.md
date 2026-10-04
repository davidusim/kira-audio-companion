<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Kira Ears architecture rules
- Audio, VAD, providers, session store and settings live in `src/lib/kira/` as framework-agnostic modules; `src/hooks/use-kira-engine.ts` is the only orchestrator — keeps UI swappable.
- Providers (STT/AI/TTS/classifiers) are interfaces; status must reflect reality and detections must never be fabricated — honesty is a product requirement.
- Secrets are read only inside server function handlers; the client sees configured/unconfigured flags only.
- Session persistence goes through `SessionPersistence` so localStorage can be swapped for a backend.
- See `docs/ARCHITECTURE.md` for the full developer guide.
