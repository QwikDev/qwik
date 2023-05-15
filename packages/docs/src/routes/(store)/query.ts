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

export const cartQuery = (id: string) => ({
  variables: {
    id: 'gid://shopify/Checkout/adcdcb1a100aae5508d7c276ec42e211?key=e4cb18e464bed5a5468f4de7b6d7c6cd',
  },
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
  fragment DiscountApplicationFragment on DiscountApplication {
    __typename
    targetSelection
    allocationMethod
    targetType
    value {
      ... on MoneyV2 {
        amount
        currencyCode
      }
      ... on PricingPercentageValue {
        percentage
      }
    }
    ... on ManualDiscountApplication {
      title
      description
    }
    ... on DiscountCodeApplication {
      code
      applicable
    }
    ... on ScriptDiscountApplication {
      title
    }
    ... on AutomaticDiscountApplication {
      title
    }
  }
  fragment AppliedGiftCardFragment on AppliedGiftCard {
    amountUsed {
      amount
      currencyCode
    }
    amountUsedV2: amountUsed {
      amount
      currencyCode
    }
    balance {
      amount
      currencyCode
    }
    balanceV2: balance {
      amount
      currencyCode
    }
    presentmentAmountUsed {
      amount
      currencyCode
    }
    id
    lastCharacters
  }
  fragment VariantWithProductFragment on ProductVariant {
    ...VariantFragment
    product {
      id
      handle
    }
  }
  fragment MailingAddressFragment on MailingAddress {
    id
    address1
    address2
    city
    company
    country
    firstName
    formatted
    lastName
    latitude
    longitude
    phone
    province
    zip
    name
    countryCode: countryCodeV2
    provinceCode
  }
  fragment CheckoutFragment on Checkout {
    id
    ready
    requiresShipping
    note
    paymentDue {
      amount
      currencyCode
    }
    paymentDueV2: paymentDue {
      amount
      currencyCode
    }
    webUrl
    orderStatusUrl
    taxExempt
    taxesIncluded
    currencyCode
    totalTax {
      amount
      currencyCode
    }
    totalTaxV2: totalTax {
      amount
      currencyCode
    }
    lineItemsSubtotalPrice {
      amount
      currencyCode
    }
    subtotalPrice {
      amount
      currencyCode
    }
    subtotalPriceV2: subtotalPrice {
      amount
      currencyCode
    }
    totalPrice {
      amount
      currencyCode
    }
    totalPriceV2: totalPrice {
      amount
      currencyCode
    }
    completedAt
    createdAt
    updatedAt
    email
    discountApplications(first: 10) {
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        node {
          __typename
          ...DiscountApplicationFragment
        }
      }
    }
    appliedGiftCards {
      ...AppliedGiftCardFragment
    }
    shippingAddress {
      ...MailingAddressFragment
    }
    shippingLine {
      handle
      price {
        amount
        currencyCode
      }
      priceV2: price {
        amount
        currencyCode
      }
      title
    }
    customAttributes {
      key
      value
    }
    order {
      id
      processedAt
      orderNumber
      subtotalPrice {
        amount
        currencyCode
      }
      subtotalPriceV2: subtotalPrice {
        amount
        currencyCode
      }
      totalShippingPrice {
        amount
        currencyCode
      }
      totalShippingPriceV2: totalShippingPrice {
        amount
        currencyCode
      }
      totalTax {
        amount
        currencyCode
      }
      totalTaxV2: totalTax {
        amount
        currencyCode
      }
      totalPrice {
        amount
        currencyCode
      }
      totalPriceV2: totalPrice {
        amount
        currencyCode
      }
      currencyCode
      totalRefunded {
        amount
        currencyCode
      }
      totalRefundedV2: totalRefunded {
        amount
        currencyCode
      }
      customerUrl
      shippingAddress {
        ...MailingAddressFragment
      }
      lineItems(first: 250) {
        pageInfo {
          hasNextPage
          hasPreviousPage
        }
        edges {
          cursor
          node {
            title
            variant {
              ...VariantWithProductFragment
            }
            quantity
            customAttributes {
              key
              value
            }
          }
        }
      }
    }
    lineItems(first: 250) {
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        cursor
        node {
          id
          title
          variant {
            ...VariantWithProductFragment
          }
          quantity
          customAttributes {
            key
            value
          }
          discountAllocations {
            allocatedAmount {
              amount
              currencyCode
            }
            discountApplication {
              __typename
              ...DiscountApplicationFragment
            }
          }
        }
      }
    }
  }
  query ($id: ID!) {
    node(id: $id) {
      __typename
      ...CheckoutFragment
    }
  }
`,
});
