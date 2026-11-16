The Retail Demo Store stores its product catalog, categories, shopping carts, and customer orders in Amazon DynamoDB using on-demand billing (`PAY_PER_REQUEST`).

Microservices look up items by primary key (`id`) and query secondary dimensions—such as products by `category` or `featured` flag, and categories by `name`—through Global Secondary Indexes.
