// server/models/User.js
const mongoose = require("mongoose"); // Importing mongoose to define my schema and model.
const bcrypt = require("bcryptjs"); // Importing bcrypt for hashing the passwords securely.

// Defining the schema for my User model. This is like the blueprint for my user's documents.
const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, "Username is required"], // Making sure a username is always provided.
    unique: true, // Ensuring usernames are unique across the application. Mongoose will create an index for this.
    trim: true, // Trimming any whitespace from the beginning and end of the username.
  },
  email: {
    type: String,
    required: [true, "Email is required"], // Email is also a mandatory field.
    unique: true, // Emails must be unique too. Mongoose handles the index here as well.
    trim: true, // Trimming whitespace from emails.
    lowercase: true, // Storing emails in lowercase to prevent case-sensitivity issues (e.g., Test@EmAiL.com vs test@email.com).
    match: [/.+\@.+\..+/, "Please fill a valid email address"], // Adding a basic regex to check for a valid email format.
  },
  password: {
    type: String,
    required: [true, "Password is required"], // Password must required.
    validate: {
      // Setting up a custom validator for more complex password rules.
      validator: function (value) {
        // This is my custom validation function for the password.
        // I'm testing the password against a regex to enforce specific criteria:
        // - At least one uppercase letter using (?=.*[A-Z])
        // - At least one special character using (?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])
        // - And it must be at least 6 characters long using .{6,}
        return /^(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{6,}$/.test(
          value
        );
      },
      // This message will be shown if the password validation fails.
      message: (props) =>
        `Password must be at least 6 characters long, contain at least one uppercase letter, and at least one special character and number.`,
    },
    createdAt: {
      type: Date,
      default: Date.now(), // This will automatically be set to the current date and time.
    },
  },
});

// Password Hashing Middleware (this runs before saving a user document).
// I'm using a 'pre-save' hook from Mongoose here.
UserSchema.pre("save", async function (next) {
  // I only want to re-hash the password if it has been modified (or it's a new user).
  // If the user is just updating their email, for example, I don't want to re-hash an existing password.
  if (!this.isModified("password")) return next(); // 'this' refers to the document being saved.

  // Generating a salt. The higher the number (cost factor), the more secure, but also slower. 10 is a good balance.
  const salt = await bcrypt.genSalt(10);
  // Hashing the plain text password with the generated salt.
  this.password = await bcrypt.hash(this.password, salt);
  // Calling next() to proceed with the save operation.
  next();
});

// Adding a custom method to my UserSchema to compare passwords during login.
// This will be available on all instances of my User model.
UserSchema.methods.matchPassword = async function (enteredPassword) {
  // 'this.password' here refers to the hashed password stored in the database for this user instance.
  // 'enteredPassword' is the plain text password the user typed in the login form.
  // bcrypt.compare will securely compare them without exposing the hashed password.
  return await bcrypt.compare(enteredPassword, this.password);
};

// Exporting the User model.
module.exports = mongoose.model("User", UserSchema);
