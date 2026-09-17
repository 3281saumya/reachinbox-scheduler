import multer from "multer";

// Store uploaded files in memory
const storage = multer.memoryStorage();

// Accept only CSV files
const fileFilter: multer.Options["fileFilter"] = (
  req,
  file,
  callback
) => {
  if (
    file.mimetype === "text/csv" ||
    file.originalname.toLowerCase().endsWith(".csv")
  ) {
    callback(null, true);
  } else {
    callback(new Error("Only CSV files are allowed"));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
  },
});