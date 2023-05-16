export const createCartMutation = () => ({
  variables: { input: {} },
  query: `
  fragment VariantFragment on ProductVariant {
    id
    title
    price {
      amount
      currencyCode
    }
    priceV2: price {
      amount
      currencyCode
    }
    weight
    available: availableForSale
    sku
    compareAtPrice {
      amount
      currencyCode
    }
    compareAtPriceV2: compareAtPrice {
      amount
      currencyCode
    }
    image {
      id
      src: url
      altText
      width
      height
    }
    selectedOptions {
      name
      value
    }
    unitPrice {
      amount
      currencyCode
    }
    unitPriceMeasurement {
      measuredType
      quantityUnit
      quantityValue
      referenceUnit
      referenceValue
    }
  }
  fragment VariantWithProductFragment on ProductVariant {
    ...VariantFragment
    product {
      id
      handle
    }
  }
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
          variant {
            ...VariantWithProductFragment
          }
          quantity
        }
      }
    }
  }
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
  fragment VariantFragment on ProductVariant {
    id
    title
    price {
      amount
      currencyCode
    }
    priceV2: price {
      amount
      currencyCode
    }
    weight
    available: availableForSale
    sku
    compareAtPrice {
      amount
      currencyCode
    }
    compareAtPriceV2: compareAtPrice {
      amount
      currencyCode
    }
    image {
      id
      src: url
      altText
      width
      height
    }
    selectedOptions {
      name
      value
    }
    unitPrice {
      amount
      currencyCode
    }
    unitPriceMeasurement {
      measuredType
      quantityUnit
      quantityValue
      referenceUnit
      referenceValue
    }
  }
  fragment VariantWithProductFragment on ProductVariant {
    ...VariantFragment
    product {
      id
      handle
    }
  }
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
          variant {
            ...VariantWithProductFragment
          }
          quantity
        }
      }
    }
  }
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
  fragment VariantFragment on ProductVariant {
    id
    title
    price {
      amount
      currencyCode
    }
    priceV2: price {
      amount
      currencyCode
    }
    weight
    available: availableForSale
    sku
    compareAtPrice {
      amount
      currencyCode
    }
    compareAtPriceV2: compareAtPrice {
      amount
      currencyCode
    }
    image {
      id
      src: url
      altText
      width
      height
    }
    selectedOptions {
      name
      value
    }
    unitPrice {
      amount
      currencyCode
    }
    unitPriceMeasurement {
      measuredType
      quantityUnit
      quantityValue
      referenceUnit
      referenceValue
    }
  }
  fragment VariantWithProductFragment on ProductVariant {
    ...VariantFragment
    product {
      id
      handle
    }
  }
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
          variant {
            ...VariantWithProductFragment
          }
          quantity
        }
      }
    }
  }
  mutation ($checkoutId: ID!, $lineItemIds: [ID!]!) {
    checkoutLineItemsRemove(checkoutId: $checkoutId, lineItemIds: $lineItemIds) {
      checkout {
        ...CheckoutFragment
      }
    }
  }
`,
});
