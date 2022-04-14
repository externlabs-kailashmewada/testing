var http = require("http");
var express = require("express");
var path = require("path");
var bodyParser = require("body-parser");
var fs = require("fs");
const promBundle = require("express-prom-bundle");
var pdfMakePrinter = require("./src/printer");

var app = express();
const sampleData = require("./templates/sampleData");
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ extended: false }));

const metricsMiddleware = promBundle({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { project_name: "PdfMakeReport", project_type: "report" },
  promClient: {
    collectDefaultMetrics: {},
  },
});

app.use(metricsMiddleware);

const getActualRequestDurationInMilliseconds = (start) => {
  const NS_PER_SEC = 1e9; // convert to nanoseconds
  const NS_TO_MS = 1e6; // convert to milliseconds
  const diff = process.hrtime(start);
  return (diff[0] * NS_PER_SEC + diff[1]) / NS_TO_MS;
};

function createPdfBinary(pdfDoc, callback) {
  var fontDescriptors = {
    Roboto: {
      normal: path.join(__dirname, "./", "fonts", "/PTSans-Regular.ttf"),
      bold: path.join(__dirname, "./", "fonts", "/PTSans-Bold.ttf"),
    },
    Itim: {
      normal: path.join(__dirname, "./", "fonts", "/Itim-Regular.otf"),
      bold: path.join(__dirname, "./", "fonts", "/Aksaramatee Bold.ttf"),
    },
  };

  var printer = new pdfMakePrinter(fontDescriptors);

  var doc = printer.createPdfKitDocument(pdfDoc);

  var chunks = [];
  var result;

  doc.on("data", function (chunk) {
    chunks.push(chunk);
  });
  doc.on("end", function () {
    result = Buffer.concat(chunks);
    callback(result.toString("base64"));
  });
  doc.end();
}

app.post("/api/report", function (req, res) {
  try {
    const templateName = req.body.template.name;
    const template = require(path.join(
      __dirname,
      "./",
      "templates",
      `/${templateName}`
    ));
    createPdfBinary(
      template(req.body.data),
      function (binary) {
        const timeStamp = new Date().getTime();

        res.contentType("application/pdf");
        fs.writeFile(
          path.join(__dirname, "./", ".tmp", `/document-${timeStamp}.pdf`),
          binary,
          { encoding: "base64" },
          function (err) {
            res.download(
              path.join(__dirname, "./", ".tmp", `/document-${timeStamp}.pdf`),
              function (err) {
                if (err) {
                  console.log(err); // Check error if you want
                }

                fs.unlink(
                  path.join(
                    __dirname,
                    "./",
                    ".tmp",
                    `/document-${timeStamp}.pdf`
                  ),
                  function () {
                    res.end();
                  }
                );
              }
            );
          }
        );
      },
      function (error) {
        res.send("ERROR:" + error);
      }
    );
  } catch (error) {
    console.log(error);
    let current_datetime = new Date();
    let formatted_date =
      current_datetime.getFullYear() +
      "-" +
      (current_datetime.getMonth() + 1) +
      "-" +
      current_datetime.getDate() +
      " " +
      current_datetime.getHours() +
      ":" +
      current_datetime.getMinutes() +
      ":" +
      current_datetime.getSeconds();
    let method = req.method;
    let url = req.url;
    const start = process.hrtime();
    const durationInMilliseconds =
      getActualRequestDurationInMilliseconds(start);
    let log = `[${formatted_date}] ${method}:${url} 400 ${error} ${durationInMilliseconds.toLocaleString()} ms`;
    fs.appendFile(
      path.join(__dirname, "./", ".tmp", "/request_logs.txt"),
      log + "\n",
      (err) => {
        if (err) {
          console.log(err);
        }
      }
    );
    return res.status(400).send({
      message: error,
    });
  }
});

// playground requires you to assign document definition to a variable called dd

var server = http.createServer(app);
var port = process.env.PORT || 3000;
server.listen(port);

console.log("http server listening on %d", port);
