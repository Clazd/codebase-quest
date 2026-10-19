from taskly.utils.slugify import slugify


def test_lowercases_and_joins_words():
    assert slugify("Hello World") == "hello-world"


def test_trims_spaces():
    assert slugify("  Taskly  ") == "taskly"


def test_drops_punctuation():
    assert slugify("Ship it!!") == "ship-it"
    assert slugify("C++ & Rust") == "c-rust"
