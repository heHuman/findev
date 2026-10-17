# Dashboard

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.3.

## Design scope

**Do not implement responsive designs.** The dashboard targets desktop browsers only:

- No `@media` / container queries, mobile breakpoints, or phone/tablet layouts.
- No mobile-specific navigation (hamburger menus, drawers) or touch-specific behaviour.
- Use plain fixed desktop layouts; a `max-width` content container is fine.

## Code conventions

- Use native `#private` fields for class-internal members; members used by templates are public (no access modifier). Don't use TypeScript's `private`/`protected` keywords.
- Components are named `XxxComponent` in `xxx.component.ts` (plus `.html`/`.scss`/`.spec.ts`); pipes are `XxxPipe` in `xxx.pipe.ts`.

## Performance

- Zoneless OnPush components read signals, so the table re-renders only when its rows change. `*cdkVirtualFor` with a `trackBy` on the ticker keeps each row's DOM in place and only rewrites the text that changed.
- Values are formatted by pure pipes, which run again only when their input value changes.
- The table body is a `cdk-virtual-scroll-viewport` with a fixed row height, so only the visible rows plus a small buffer are in the DOM. The rendering cost no longer depends on the instrument count, which matters if the limit of 100 is raised to the thousands. `aria-rowcount` and `aria-rowindex` keep the full table size available to assistive tech.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.
