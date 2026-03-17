async function main() {
  const categories = await (await fetch('https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/categories.json')).json();
  const attributes = await (await fetch('https://raw.githubusercontent.com/Shopify/product-taxonomy/main/dist/en/attributes.json')).json();

  console.log('Categories Root Keys:', Object.keys(categories));
  console.log('Attributes Root Keys:', Object.keys(attributes));

  if (categories.verticals) {
    console.log('Verticals sample:', JSON.stringify(categories.verticals[0]).substring(0, 500));
    console.log('Vertical[0] category list count:', categories.verticals[0].categories?.length);
    if (categories.verticals[0].categories?.[0]) {
        console.log('Category sample:', JSON.stringify(categories.verticals[0].categories[0]).substring(0, 500));
    }
  }

  if (attributes.attributes) {
    console.log('Attributes sample:', JSON.stringify(attributes.attributes[0]).substring(0, 500));
  }
}
main();
