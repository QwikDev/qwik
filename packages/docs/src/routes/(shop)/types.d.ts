export type ShopProductType = {
  id: string;
  title: string;
  availableForSale: boolean;
  image: {
    height: number;
    width: number;
    src: string;
  };
  body_html: string;
  variants: {
    id: string;
    title: string;
    price: {
      amount: string;
      currencyCode: string;
    };
    available: boolean;
  }[];
};
