export type ShopApp = { products?: UIProduct[]; cart?: Checkout };

export type CheckoutLineItemsAddMutation = {
  data: { checkoutLineItemsAdd: { checkout: Checkout } };
};

export type CheckoutLineItemsRemoveMutation = {
  data: { checkoutLineItemsRemove: { checkout: Checkout } };
};

export type CheckoutCreateMutation = {
  data: { checkoutCreate: { checkout: Checkout } };
};

export type CheckoutQuery = {
  data: { node: Checkout };
};

export type Checkout = {
  id: string;
  webUrl: string;
  totalPrice: TotalPrice;
  lineItems: LineItems;
};

export type TotalPrice = {
  amount: string;
  currencyCode: string;
};

export type LineItems = {
  edges: { node: LineItemsNode }[];
};

export type LineItemsNode = {
  id: string;
  title: string;
  quantity: number;
  variant: Variant;
};

export type Variant = {
  id: string;
  title: string;
  price: Price;
  available: boolean;
  image: Image;
};

export type Price = {
  amount: string;
  currencyCode: string;
};

export type Image = {
  url: string;
  altText: string;
};

export type ProductsQuery = {
  data: { node: { products: { edges: { node: Product }[] } } };
};

export type Product = {
  id: string;
  title: string;
  availableForSale: boolean;
  descriptionHtml: string;
  images: { edges: { node: Image }[] };
  variants: { edges: { node: Variant }[] };
};

export type UIProduct = {
  id: string;
  title: string;
  availableForSale: boolean;
  descriptionHtml: string;
  image: Image;
  variants: Variant[];
};
