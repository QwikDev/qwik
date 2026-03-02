import { expect, type Locator, type Page } from "@playwright/test";

export type DriverLocator = Locator | Page;

export function createTestDriver<T extends DriverLocator>(rootLocator: T) {
  const getModal = (alert?: boolean) => {
    return rootLocator.getByRole(alert ? "alertdialog" : "dialog");
  };

  const getTrigger = () => {
    return rootLocator.getByRole("button", { name: "Open Modal" });
  };

  const getTitle = () => {
    return rootLocator.getByRole("heading");
  };

  const getDescription = () => {
    return rootLocator.getByRole("paragraph");
  };

  const openModal = async () => {
    await getTrigger().click();

    // should be open initially
    await expect(getModal()).toBeVisible();
  };

  return {
    ...rootLocator,
    locator: rootLocator,
    getModal,
    getTrigger,
    openModal,
    getTitle,
    getDescription,
  };
}
