import { checkoutFragment } from "./common-gql";

export const productQuery = (
  id = import.meta.env.PUBLIC_SHOPIFY_COLLECTION_ID,
  productsFirst = 20
) => ({
  variables: { id, productsFirst },
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
    image {
      id
      url
      altText
      width
      height
    }
  }
  fragment CollectionFragment on Collection {
    id
    handle
    description
    descriptionHtml
    updatedAt
    title
    image {
      id
      url
      altText
    }
  }
  fragment ProductFragment on Product {
    id
    availableForSale
    createdAt
    updatedAt
    descriptionHtml
    description
    handle
    productType
    title
    vendor
    publishedAt
    onlineStoreUrl
    options {
      id
      name
      values
    }
    images(first: 250) {
      edges {
        node {
          id
          url
          altText
          width
          height
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
      __typename
      ...CollectionFragment
      ... on Collection {
        id
        products(first: $productsFirst) {
          pageInfo {
            hasNextPage
            hasPreviousPage
          }
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

export const cartQuery = (id: string) => ({
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
