/** WISHSCENE_PRODUCT=1 switches /api/v1 to the product API. Import-light on purpose. */
export const productMode = () => process.env.WISHSCENE_PRODUCT === '1';
