export const productQuery = (id = import.meta.env.VITE_SHOPIFY_COLLECTION_ID, productsFirst = 20) => ({
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
  fragment CollectionFragment on Collection {
    id
    handle
    description
    descriptionHtml
    updatedAt
    title
    image {
      id
      src: url
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
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        cursor
        node {
          id
          src: url
          altText
          width
          height
        }
      }
    }
    variants(first: 250) {
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        cursor
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
            cursor
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
