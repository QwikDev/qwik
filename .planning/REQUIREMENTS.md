# Requirements: Qwik Vite Environment API Validation

**Defined:** 2025-01-24
**Core Value:** Confidence that the Environment API migration works correctly with Vite 7+

## v1 Requirements

Requirements for validating the Environment API migration. Each maps to roadmap phases.

### Environment API Activation

- [x] **ENV-01**: Vite 7+ detected and `environments` config is applied
- [x] **ENV-02**: `server.environments.client` and `server.environments.ssr` exist in dev server
- [x] **ENV-03**: `this.environment` available in plugin hooks during dev

### Dev Mode with Environment API

- [ ] **DEV-01**: Client renders using `environments.client` module graph
- [ ] **DEV-02**: SSR renders using `environments.ssr` module graph
- [ ] **DEV-03**: File change triggers `hotUpdate` hook (not legacy `handleHotUpdate`)
- [ ] **DEV-04**: HMR uses `this.environment.hot.send()` for reload

### Build Mode

- [ ] **BUILD-01**: Client build generates q-manifest.json
- [ ] **BUILD-02**: SSR build consumes manifest correctly
- [ ] **BUILD-03**: Production app works end-to-end

### Regression Testing

- [ ] **REG-01**: Existing Playwright e2e tests pass
- [ ] **REG-02**: Existing unit tests pass

## v2 Requirements

Deferred to future milestones.

### Testing Infrastructure

- **TEST-01**: Playwright tests that run against Vite dev server
- **TEST-02**: Automated Environment API path validation

### Advanced HMR

- **HMR-01**: routeLoader$ caching (skip unchanged loaders)
- **HMR-02**: Partial component updates

### Build Coordination

- **BUILD-04**: Use `builder.buildApp()` for single coordinated build

## Out of Scope

| Feature | Reason |
|---------|--------|
| REPL/Rolldown validation | Has unit test coverage, lower priority for this milestone |
| Router plugin deep migration | Evaluate after core validation passes |
| Custom DevEnvironment classes | Start without, add if needed later |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ENV-01 | Phase 1 | Complete |
| ENV-02 | Phase 1 | Complete |
| ENV-03 | Phase 1 | Complete |
| DEV-01 | Phase 2 | Pending |
| DEV-02 | Phase 2 | Pending |
| DEV-03 | Phase 2 | Pending |
| DEV-04 | Phase 2 | Pending |
| BUILD-01 | Phase 3 | Pending |
| BUILD-02 | Phase 3 | Pending |
| BUILD-03 | Phase 3 | Pending |
| REG-01 | Phase 4 | Pending |
| REG-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 12 total
- Mapped to phases: 12
- Unmapped: 0 ✓

---
*Requirements defined: 2025-01-24*
*Last updated: 2025-01-24 after initial definition*
