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