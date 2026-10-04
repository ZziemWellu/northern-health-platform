import transcribe_akan as t


def test_a_looping_phrase_is_cut_to_two_copies():
    assert t.collapse_repetitions("wo ho te sɛn " * 4) == "wo ho te sɛn wo ho te sɛn"


def test_normal_speech_is_left_alone():
    assert t.collapse_repetitions("a b c d e") == "a b c d e"
    assert t.collapse_repetitions("wo ho te sɛn wo ho te sɛn") == "wo ho te sɛn wo ho te sɛn"


def test_a_single_repeated_word_is_cut_but_not_lost():
    assert t.collapse_repetitions("ye ye ye ye") == "ye ye"


def test_empty_and_short_text():
    assert t.collapse_repetitions("") == ""
    assert t.collapse_repetitions("x") == "x"


def test_output_length_is_capped_by_audio_duration():
    assert t.token_cap(2.0) == 20
    assert t.token_cap(60.0) == t.MAX_TOKENS


def test_a_transcript_far_above_speech_rate_is_rejected():
    assert t.is_plausible("wo ho te sɛn " * 3, 3.0)
    assert not t.is_plausible(" ".join(["ye"] * 200), 25.0)
    assert not t.is_plausible("wo", 0)
