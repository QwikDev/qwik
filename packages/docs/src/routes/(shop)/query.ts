import { checkoutFragment } from './mutation';

export const productsQuery = (
  id = import.meta.env.PUBLIC_SHOPIFY_COLLECTION_ID,
  productsFirst = 100
) => ({
  variables: { id, productsFirst },
  query: `
  fragment VariantFragment on ProductVariant {
    id
    available: availableForSale
    title
    price {
      amount
      currencyCode
    }
  }
  fragment ProductFragment on Product {
    id
    title
    availableForSale
    descriptionHtml
    images(first: 250) {
      edges {
        node {
          url
          altText
        }
      }
    }
    variants(first: 250) {
      edges {
        node {
          ...VariantFragment
        }
      }
    }
  }
  query ($id: ID!, $productsFirst: Int!) {
    node(id: $id) {
      ... on Collection {
        products(first: $productsFirst) {
          edges {
            node {
              ...ProductFragment
            }
          }
        }
      }
    }
  }
`,
});

export const checkoutQuery = (id: string) => ({
  variables: { id },
  query: `
  ${checkoutFragment}
  query ($id: ID!) {
    node(id: $id) {
      ...CheckoutFragment
    }
  }
`,
});
