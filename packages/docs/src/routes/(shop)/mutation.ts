import { checkoutFragment } from "./common-gql";

export const createCartMutation = () => ({
  variables: { input: {} },
  query: `
  ${checkoutFragment}
  mutation ($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkout {
        ...CheckoutFragment
      }
    }
  }  
`,
});

export const modifyLineItemMutation = (
  checkoutId: string,
  variantId: string,
  quantity: number
) => ({
  variables: { checkoutId, lineItems: [{ variantId, quantity }] },
  query: `
  ${checkoutFragment}
  mutation ($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsAdd(checkoutId: $checkoutId, lineItems: $lineItems) {
      checkout {
        ...CheckoutFragment
      }
    }
  }    
`,
});

export const removeLineItemMutation = (checkoutId: string, lineItemIds: string[]) => ({
  variables: { checkoutId, lineItemIds },
  query: `
  ${checkoutFragment}
  mutation ($checkoutId: ID!, $lineItemIds: [ID!]!) {
    checkoutLineItemsRemove(checkoutId: $checkoutId, lineItemIds: $lineItemIds) {
      checkout {
        ...CheckoutFragment
      }
    }
  }
`,
});
