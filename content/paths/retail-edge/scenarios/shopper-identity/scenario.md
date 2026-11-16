The Retail Demo Store authenticates shoppers with Amazon Cognito and issues temporary IAM credentials via a Cognito Identity Pool for both signed-in shoppers and guest browsers.

Create the Cognito User Pool (`retaildemostore-user-pool`) and public SPA app client (`retaildemostore-web-client`) first, then wire the Cognito Identity Pool and its authenticated and unauthenticated IAM roles.
