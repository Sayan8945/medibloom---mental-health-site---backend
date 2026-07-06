const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id).select('-__v');
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

passport.use(
  new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email  = profile.emails?.[0]?.value;
        // Remove size restrictions from Google photo URL so full-res loads
        const rawAvatar = profile.photos?.[0]?.value || '';
        const avatar = rawAvatar.replace(/=s\d+-c$/, '=s256-c');

        // Find by googleId first, then fall back to email (handles re-auth)
        let user = await User.findOne({ googleId: profile.id });

        if (!user && email) {
          user = await User.findOne({ email });
        }

        if (user) {
          // Update avatar if it changed
          user.googleId = profile.id;
          if (avatar && user.avatar !== avatar) user.avatar = avatar;
          user.verified = true;
          await user.save();
          return done(null, user);
        }

        // New user
        user = await User.create({
          googleId:  profile.id,
          fullName:  profile.displayName,
          email,
          avatar,
          provider:  'google',
          verified:  true,
        });

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
