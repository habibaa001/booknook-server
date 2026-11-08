# BookNook – Server Side API

RESTful API service for BookNook built with Express.js and MongoDB Native Driver.

## Key Features
- **JWT Authorization**: Token validation middleware safeguarding private operations.
- **Atomic Operations**: Safe stock tracking using `$inc` operators.
- **Duplicate Prevention**: Guard rails checking duplicate active borrows per user.
- **Flexible Catalog Querying**: Limit and descending sort querying capabilities.
- **Pre-seeded Library Catalog**: 12 pre-configured public books for instant demo availability.