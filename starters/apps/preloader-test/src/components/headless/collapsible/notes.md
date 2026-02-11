# Disclosure Component Research

## Inspiration:

- ARIA Authoring Practices Guide (APG)

## Key Points:

A disclosure widget allows content to be shown or hidden, enhancing accessibility and user experience by managing content visibility.

## Anatomy:

    <Collapsible>
        <CollapsibleTrigger />
        <CollapsibleContent />
    </Collapsible>

## Features:

    - [ ] Show/Hide Content
    - [ ] Accessible to keyboard users
    - [ ] ARIA roles and properties for enhanced screen reader support
    - [ ] Optionally, support for dynamically loading the disclosed content

## Keyboard Interactions:

    key: Enter
    description: Toggles the visibility of the disclosure content.

    key: Space
    description: Toggles the visibility of the disclosure content.

## WAI-ARIA Roles, States, and Properties:

    - The button controlling the disclosure has `role="button"` and `aria-expanded` attribute which indicates the visibility state of the content.
    - Optionally, `aria-controls` can be used on the button to reference the id of the content container.

## Use Cases:

- FAQ sections
- Navigation menus with collapsible sections
- Hiding and revealing more detailed content

## Accessibility Considerations:

- Ensure that the state (expanded or collapsed) is clearly communicated to assistive technologies.
- Provide visual indicators (like arrows) that hint at the action of the button.
- Consider dynamically loading content as an enhancement, not a requirement, for the functionality to work.

## Downsides:

- Dynamic content loading can introduce complexity in maintaining state and accessibility.
