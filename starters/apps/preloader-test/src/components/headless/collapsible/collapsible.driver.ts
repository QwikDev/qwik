import { Locator, expect, Page } from "@playwright/test";
type OpenKeys = "Space" | "Enter";
export type DriverLocator = Locator | Page;

export function createTestDriver<T extends DriverLocator>(rootLocator: T) {
  const getRoot = () => {
    return rootLocator.locator("[data-collapsible]");
  };

  const getTrigger = () => {
    return getRoot().getByRole("button");
  };

  const getContent = () => {
    return getRoot().locator("[data-collapsible-content]");
  };

  const openCollapsible = async (key: OpenKeys | "click") => {
    await getTrigger().focus();

    if (key !== "click") {
      await getTrigger().press(key);
    } else {
      await getTrigger().click();
    }

    // should be open initially
    await expect(getContent()).toBeVisible();
  };

  /**
   * Wait for all animations within the given element and subtrees to finish
   * See: https://github.com/microsoft/playwright/issues/15660#issuecomment-1184911658
   */
  function waitForAnimationEnd(selector: string) {
    return getRoot()
      .locator(selector)
      .evaluate((element) =>
        Promise.all(
          element.getAnimations().map((animation) => animation.finished),
        ),
      );
  }

  return {
    ...rootLocator,
    locator: rootLocator,
    getRoot,
    getTrigger,
    getContent,
    openCollapsible,
    waitForAnimationEnd,
  };
}
