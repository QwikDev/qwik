export const checkoutCreateMutation = () => ({
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

const variantFragment = `
  fragment VariantFragment on ProductVariant {
    id
    title
    price {
      amount
      currencyCode
    }
    available: availableForSale
    image {
      url
      altText
    }
  }
`;

const variantWithProductFragment = `
  ${variantFragment}
  fragment VariantWithProductFragment on ProductVariant {
    ...VariantFragment
  }
`;

export const checkoutFragment = `
  ${variantWithProductFragment}
  fragment CheckoutFragment on Checkout {
    id
    webUrl
    totalPrice {
      amount
      currencyCode
    }
    lineItems(first: 250) {
      edges {
        node {
          id
          title
          quantity
          variant {
            ...VariantWithProductFragment
          }
        }
      }
    }
  }
`;
