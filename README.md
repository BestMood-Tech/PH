# Project for load lists of users based on things they have upvoted from Product Hunt API.

_To run the project, you must have:_
- Node.js + npm
- MongoDB

You should start MongoDB (for linux `sudo service mongod start`).
Then run `npm install`. File `list.yaml` contains url of posts, 
for that you want to load upvoted users.
You can add own urls (but you should save structure of this file). 
Then you should run `node app.js list.yaml`.
After downloading all data in the directory will appear files with the format `.csv`.