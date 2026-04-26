from flask import Flask, send_from_directory

app = Flask(__name__)


@app.get("/")
def index():
    return send_from_directory(app.root_path, "index.html")


if __name__ == "__main__":
    app.run(debug=True)
