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
  fragment UserErrorFragment on UserError {
    field
    message
  }
  fragment CheckoutUserErrorFragment on CheckoutUserError {
    field
    message
    code
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
  mutation ($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      userErrors {
        ...UserErrorFragment
      }
      checkoutUserErrors {
        ...CheckoutUserErrorFragment
      }
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
  fragment UserErrorFragment on UserError {
    field
    message
  }
  fragment CheckoutUserErrorFragment on CheckoutUserError {
    field
    message
    code
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
  mutation ($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsAdd(checkoutId: $checkoutId, lineItems: $lineItems) {
      userErrors {
        ...UserErrorFragment
      }
      checkoutUserErrors {
        ...CheckoutUserErrorFragment
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }    
`,
});

export const removeLineItemMutation = (
  checkoutId: string,
  lineItemIds: string[],
) => ({
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
  fragment UserErrorFragment on UserError {
    field
    message
  }
  fragment CheckoutUserErrorFragment on CheckoutUserError {
    field
    message
    code
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
  mutation ($checkoutId: ID!, $lineItemIds: [ID!]!) {
    checkoutLineItemsRemove(checkoutId: $checkoutId, lineItemIds: $lineItemIds) {
      userErrors {
        ...UserErrorFragment
      }
      checkoutUserErrors {
        ...CheckoutUserErrorFragment
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
`,
});

